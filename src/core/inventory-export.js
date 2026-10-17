'use strict';
// Neutralize spreadsheet formulas without altering source inventory data.
function csvCell(value){let text=String(value??'').replace(/\0/g,'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function inventoryCSV(scan){if(!scan?.id||!Array.isArray(scan.files))throw new Error('Scan a folder before exporting its inventory');const rows=[['Name','Full path','Bytes','Category','Modified','SHA-256','Duplicate group']];for(const f of scan.files.slice(0,100000))rows.push([f.name,f.path,f.size,f.category,f.modifiedAt,f.sha256,f.duplicateGroupId]);return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
module.exports={csvCell,inventoryCSV};
