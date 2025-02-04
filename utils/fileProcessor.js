import fs from 'fs';
import pdfParse from 'pdf-parse';
import xlsx from 'xlsx';
import csvParser from 'csv-parser';

// ✅ Extract Data from PDF
export const extractFromPDF = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ERROR: File not found: ${filePath}`);
      return { error: 'File not found' };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(fileBuffer);
    const text = pdfData.text;

    // Handle different formats of lease end dates
    const leaseEndDateMatch = text.match(/Lease End Date:\s*(\d{2}\/\d{2}\/\d{4})/i) || 
                              text.match(/End Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const leaseEndDate = leaseEndDateMatch ? leaseEndDateMatch[1] : 'Not found';

    // Extract monthly payment amount
    const paymentMatch = text.match(/Monthly Payment:\s*£?([\d,]+(?:\.\d{2})?)/i);
    const monthlyPayment = paymentMatch ? parseFloat(paymentMatch[1].replace(',', '')) : 0;

    // Calculate settlement cost
    const settlementCost = calculateSettlementCost(leaseEndDate, monthlyPayment);

    return { leaseEndDate, monthlyPayment, settlementCost };
  } catch (error) {
    console.error('❌ Error processing PDF:', error.message);
    return { error: 'Failed to process PDF' };
  }
};

// ✅ Extract Data from Excel (XLSX)
export const extractFromExcel = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ERROR: File not found: ${filePath}`);
      return { error: 'File not found' };
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Handle different column name variations
    const leaseEndDateKeys = ['Lease End Date', 'End Date', 'Lease Expiry'];
    const monthlyPaymentKeys = ['Monthly Payment', 'Payment per Month', 'Installment Amount'];

    // Extract lease end date
    let leaseEndDate = 'Not found';
    leaseEndDateKeys.forEach(key => {
      if (sheet[0]?.[key]) {
        leaseEndDate = sheet[0][key];
      }
    });

    // Extract monthly payment
    let monthlyPayment = 0;
    monthlyPaymentKeys.forEach(key => {
      if (sheet[0]?.[key]) {
        monthlyPayment = parseFloat(sheet[0][key]);
      }
    });

    // Calculate settlement cost
    const settlementCost = calculateSettlementCost(leaseEndDate, monthlyPayment);

    return { leaseEndDate, monthlyPayment, settlementCost };
  } catch (error) {
    console.error('❌ Error processing Excel:', error.message);
    return { error: 'Failed to process Excel file' };
  }
};

// ✅ Extract Data from CSV
export const extractFromCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ERROR: File not found: ${filePath}`);
      return reject({ error: 'File not found' });
    }

    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Handle different column names
        const leaseEndDate = results[0]?.['Lease End Date'] || results[0]?.['End Date'] || 'Not found';
        const monthlyPayment = results[0]?.['Monthly Payment'] ? parseFloat(results[0]['Monthly Payment']) : 0;

        const settlementCost = calculateSettlementCost(leaseEndDate, monthlyPayment);

        resolve({ leaseEndDate, monthlyPayment, settlementCost });
      })
      .on('error', (error) => {
        console.error('❌ Error processing CSV:', error.message);
        reject({ error: 'Failed to process CSV file' });
      });
  });
};

// ✅ Function to Calculate Settlement Cost
const calculateSettlementCost = (leaseEndDate, monthlyPayment) => {
  if (leaseEndDate === 'Not found' || monthlyPayment === 0) {
    return {
      leaseEndDate: 'Missing in document',
      monthlyPayment: 'Missing in document',
      settlementCost: 'No lease data available'
    };
  }

  try {
    const leaseEnd = new Date(leaseEndDate);
    const today = new Date();

    // Calculate remaining months
    const remainingMonths = (leaseEnd.getFullYear() - today.getFullYear()) * 12 + (leaseEnd.getMonth() - today.getMonth());

    if (remainingMonths <= 0) {
      return 'Lease already ended';
    }

    // Assume settlement = remaining payments * 80% (negotiable with vendor)
    const settlementCost = Math.round(remainingMonths * monthlyPayment * 0.8);

    return `£${settlementCost}`;
  } catch (error) {
    console.error('❌ Error calculating settlement cost:', error.message);
    return 'Error in calculation';
  }
};
