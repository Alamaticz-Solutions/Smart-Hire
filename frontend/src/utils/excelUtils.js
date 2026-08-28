/**
 * Exports JSON data to an Excel file (.xlsx) with status dropdown lists and custom styling
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Name of the file to save
 * @param {string} sheetName - Name of the worksheet
 */
export const exportToExcel = async (data, filename = 'candidates.xlsx', sheetName = 'Candidates') => {
    if (!data || data.length === 0) {
        console.error('No data to export');
        return;
    }

    try {
        // exceljs alone accounted for most of the 1MB+ "DataTable" bundle
        // (Jobs and Candidates both import this module, so it loaded on
        // every visit to either page even if the user never exports
        // anything). A dynamic import here code-splits it into its own
        // chunk that only downloads the moment someone actually clicks
        // Export/Download Excel - every caller already awaits this
        // function, so nothing else needs to change.
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);

        // Get columns from keys of the first data object
        const headers = Object.keys(data[0]);
        worksheet.columns = headers.map(h => ({ header: h, key: h, width: 22 }));

        // Add rows
        worksheet.addRows(data);

        // Find the column index of 'Candidate Status'
        const statusColIndex = headers.findIndex(h => h.toLowerCase() === 'candidate status');
        
        if (statusColIndex !== -1) {
            // Excel columns are 1-indexed
            const colLetter = worksheet.getColumn(statusColIndex + 1).letter;
            
            // Add validation to data rows (plus buffer rows for manual additions)
            const rowCount = Math.max(data.length + 50, 100);
            for (let i = 2; i <= rowCount; i++) {
                const cell = worksheet.getCell(`${colLetter}${i}`);
                cell.dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['"New,In-Review,Available,Selected,Rejected,Engaged,Offered,Hired"']
                };
            }
        }

        // Apply styled header row formatting
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Segoe UI', size: 11 };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '00203F' } // Deep navy/dark blue
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
        headerRow.height = 25;

        // Apply segment formatting to the grid rows
        for (let i = 2; i <= data.length + 1; i++) {
            const row = worksheet.getRow(i);
            row.alignment = { vertical: 'middle' };
            row.font = { name: 'Segoe UI', size: 10 };
            
            // Alternate row background colors (zebra striping)
            if (i % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F4F8FA' }
                };
            }
        }

        // Write workbook to buffer and trigger download in-browser
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Excel export failed:', error);
    }
};

/**
 * Formats candidate data for Excel export by removing internal IDs and formatting Arrays
 * @param {Array} candidates - Raw candidate objects from API
 * @returns {Array} - Formatted objects for Excel
 */
export const formatCandidatesForExcel = (candidates, columns = []) => {
    return candidates.map(c => {
        const row = {};
        
        if (columns && columns.length > 0) {
            // Use dynamic columns provided from API
            columns.forEach(col => {
                row[col.col_label] = c[col.col_key] || (col.col_key === 'pega_experience' || col.col_key === 'total_experience' ? 0 : '—');
            });
            row['Filename'] = c.filename || '—';
            row['Analyzed At'] = c.timestamp ? new Date(c.timestamp).toLocaleString() : '—';
        } else {
            // Fallback to static if no dynamic columns
            row['Full Name'] = c.full_name || '—';
            row['Total Experience (yrs)'] = c.total_experience || 0;
            row['Pega Experience (yrs)'] = c.pega_experience || 0;
            row['Source'] = c.source || '—';
            row['Skills'] = c.skills || '—';
            row['Certifications'] = c.certifications || '—';
            row['CTC'] = c.ctc || '—';
            row['Notice Period'] = c.notice_period || '—';
            row['Current Organization'] = c.current_organization || '—';
            row['Email'] = c.email || '—';
            row['Phone'] = c.phone || '—';
            row['LinkedIn'] = c.linkedin || '—';
            row['Filename'] = c.filename || '—';
            row['Analyzed At'] = c.timestamp ? new Date(c.timestamp).toLocaleString() : '—';
        }
        
        return row;
    });
};
