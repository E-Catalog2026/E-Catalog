/* ------------ Column Aliases ------------- */
const aliasLists = {
    "jde stock no": [
        "jde stock no", "jde stock no.", "jde", "jde no", "jde code", "jde item no", "jde item number",
        "jde sku", "jdestockno"],
    "sap stock no": [
        "sap stock no", "sap stock no.", "sap", "sap no", "material no", "material number", "sap item no"],
    "quotation no": [
        "quotation no", "quotation no.", "quotation number", "quote no", "quote number", "qt no", "qtn no"],
    "vendor name": ["vendor name", "vendor", "supplier name", "supplier"],
    "brand": ["brand", "manufacturer"],
    "supplier description": ["description", "item description", "supplier description"],
    "unit price": ["unit price", "price", "unit cost", "unit price (thb)", "unit price (thb) global contract", "unit price thb global contract"],
    "lead time": ["lead time", "delivery time"],
    "start date": ["start date", "effective date", "start"],
    "end date": ["end date", "expiry date", "expire date", "valid to"],
    "spare part type": ["spare part type", "spare part", "part type", "type", "spare type"],
};

/* ------------ Standard Columns ------------ */
const standardColumns = [
    "Vendor Name", "JDE Stock No", "SAP Stock No", "Brand",
    "Supplier Description", "Unit Price", "Lead Time",
    "Start Date", "End Date", "Quotation No", "Credit Term"
];

/* Helpers */
function norm(s) { return String(s || "").toLowerCase().replace(/[\n\r.\-_,()]/g, "").trim(); }

function matchHeader(h) {
    const key = norm(h);
    for (const std in aliasLists) {
        for (const a of aliasLists[std]) {
            if (key === norm(a)) return std;
        }
    }
    return null;
}

function escapeHTML(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/* Format date */
function ddmmyyyy(v) {
    if (!v) return "";

    // 1) Excel serial number
    if (typeof v === "number") {
        const d = XLSX.SSF.parse_date_code(v);
        if (d && d.y) {
            return `${String(d.d).padStart(2, '0')}-${String(d.m).padStart(2, '0')}-${d.y}`;
        }
    }

    if (typeof v === "string") {
        v = v.trim();

        // 2) DD/MM/YYYY or DD-MM-YYYY
        let m = v.match(/^(\d{1,2})\/\-\/\-$/);
        if (m) {
            return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
        }

        // 3) MM/DD/YY  (เช่น 1/15/24)
        m = v.match(/^(\d{1,2})\/\-\/\-$/);
        if (m) {
            const year = Number(m[3]) + 2000; // 24 → 2024
            return `${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}-${year}`;
        }

        // 4) YYYY-MM-DD
        m = v.match(/^(\d{4})\/\-\/\-$/);
        if (m) {
            return `${String(m[3]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}-${m[1]}`;
        }
    }

    return v; // fallback ถ้าอ่านไม่ออก
}

function showOverlay(x) {
    document.getElementById("overlay").style.display = x ? "block" : "none";
}

/* ------------ Global Dataset (all sheets combined) ------------ */
let allData = [];

/* ------------ Google Sheets loader (public CSV export) ------------ */
// If you want automatic loading, set AUTO_GSHEET_URL to a public sheet URL.
const AUTO_GSHEET_URL = "https://docs.google.com/spreadsheets/d/1KQddH8khGnU-nFVeTT3urNueEJ1_R4yL/edit?usp=sharing&ouid=114342933923439825885&rtpof=true&sd=true";

function parseGSheetUrl(url){
    try{
        const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if(!idMatch) return null;
        const id = idMatch[1];
        const gidMatch = url.match(/[?&]gid=(\d+)/);
        const gid = gidMatch ? gidMatch[1] : null;
        return {id,gid};
    }catch(e){return null;}
}

function loadGoogleSheetFromUrl(url){
    const info = parseGSheetUrl(url);
    if(!info){ setGStatus('error','Invalid Google Sheet URL'); return; }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${info.id}/export?format=csv${info.gid?('&gid='+info.gid):''}`;
    setGStatus('loading','Loading...');
    showOverlay(true);
    fetch(exportUrl).then(r=>{
        if(!r.ok) throw new Error('Failed to fetch sheet. It may not be public.');
        return r.text();
    }).then(text=>{
        Papa.parse(text,{header:true,skipEmptyLines:true,complete:(res)=>{ 
            allData = []; 
            processSheet('GoogleSheet', res.data); 
            setGStatus('ok','Loaded'); showOverlay(false); 
            document.getElementById('fileName').textContent = "E-Catalog 2026.xlsx (Google Sheet)";
        }, error:(err)=>{ setGStatus('error',err.message); alert(err.message); showOverlay(false); }});
    }).catch(err=>{ setGStatus('error',err.message); alert('Error loading Google Sheet: '+err.message); showOverlay(false); });
}

// Status helper for the top-right indicator
function setGStatus(state, msg){
    const el = document.getElementById('gsStatus');
    if(!el) return;
    el.classList.remove('ok','error','loading');
    if(state) el.classList.add(state);
    el.textContent = msg ? msg : (state||'idle');
}

// Auto-load if AUTO_GSHEET_URL is set
window.addEventListener('load', ()=>{
    if(AUTO_GSHEET_URL){
        try{
            loadGoogleSheetFromUrl(AUTO_GSHEET_URL);
        }catch(e){ console.warn('Auto load failed', e); setGStatus('error','Auto-load failed'); }
    }
});

/* Process a sheet */
function processSheet(name, rows) {
    if (rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const headerMap = {};

    headers.forEach(h => {
        const std = matchHeader(h);
        if (std) headerMap[std] = h;
        else headerMap[norm(h)] = h;
    });

    console.log("Sheet:", name, "Headers:", headers);

    rows.forEach(row => {
        const obj = {};
        const spareCol = headerMap["spare part type"];
        obj["Spare Part Type"] = spareCol ? row[spareCol] : "";
        standardColumns.forEach(std => {
            let col = headerMap[std] || headerMap[norm(std)];
            let val = col ? row[col] : "";
            if (std === "Start Date" || std === "End Date") val = ddmmyyyy(val);
            obj[std] = val ?? "";
        });
        allData.push(obj);
    });
}

/* Search Function */
document.getElementById("searchBtn").addEventListener("click", search);

["vendor", "jde", "sap", "brand", "spareType"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
        if (e.key === "Enter") search();
    });
});

function search() {
    if (allData.length === 0) {
        renderNoData("No data found ( Please upload a file )");
        return;
    }

    const vendor = document.getElementById("vendor").value.toLowerCase().trim();
    const jde = document.getElementById("jde").value.toLowerCase().trim();
    const sap = document.getElementById("sap").value.toLowerCase().trim();
    const brand = document.getElementById("brand").value.toLowerCase().trim();
    const spareType = document.getElementById("spareType").value.toLowerCase().trim();

    // ⛔ ถ้าไม่กรอกอะไรเลย → แสดง No data found ในตาราง
    if (!vendor && !jde && !sap && !brand && !spareType) {
        renderNoData("( Please enter search keywords )");
        return;
    }

    const filtered = allData.filter(r =>
        (!vendor || (r["Vendor Name"] && r["Vendor Name"].toLowerCase().includes(vendor))) &&
        (!jde || (r["JDE Stock No"] && r["JDE Stock No"].toLowerCase().includes(jde))) &&
        (!sap || (r["SAP Stock No"] && r["SAP Stock No"].toLowerCase().includes(sap))) &&
        (!brand || (r["Brand"] && r["Brand"].toLowerCase().includes(brand))) &&
        (!spareType || (r["Spare Part Type"] && r["Spare Part Type"].toLowerCase().includes(spareType)))
    );

    renderTable(filtered);
}

function renderNoData(msg) {
    const out = document.getElementById("output");
    out.innerHTML = `
<table><thead><tr><th>Result</th></tr></thead>
<tbody><tr><td class="no-data">${msg}</td></tr></tbody></table>
`;
}

function formatAccounting(val) {
    if (val === null || val === undefined || val === "") return "";

    // แปลง string → number
    let num = Number(String(val).replace(/,/g, ""));
    if (isNaN(num)) return val;

    // รูปแบบ accounting
    if (num < 0) {
        return `(${Math.abs(num).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })})`;
    }

    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/* Render */
function renderTable(rows) {
    const out = document.getElementById("output");
    if (rows.length === 0) {
        out.innerHTML = `
<div class="table-wrapper">
    <table>
        <thead><tr><th>Result</th></tr></thead>
        <tbody><tr><td class="no-data">( No data found )</td></tr></tbody>
    </table>
</div>`;
        return;
    }

    let html = `<div class="table-wrapper"><table><thead><tr>`;
    standardColumns.forEach(c => html += `<th>${escapeHTML(c)}</th>`);
    html += "</tr></thead><tbody>";

    rows.forEach(r => {
        html += "<tr>";
        standardColumns.forEach(c => {

            // Supplier Description
            if (c === "Supplier Description") {
                html += `<td class="td-desc">${escapeHTML(r[c])}</td>`;

                // Unit Price
            } else if (c === "Unit Price") {
                html += `<td class="td-price">${formatAccounting(r[c])}</td>`;

                // Others
            } else {
                html += `<td>${escapeHTML(r[c])}</td>`;
            }

        });
        html += "</tr>";
    });

    html += "</tbody></table></div>";
    out.innerHTML = html;
}