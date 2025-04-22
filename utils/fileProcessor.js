import fs from 'fs';
import pdfParse from 'pdf-parse';
import csvParser from 'csv-parser';
import xlsx from 'xlsx';

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

    const leaseEndDateMatch =
      text.match(/Lease End Date:\s*(\d{2}\/\d{2}\/\d{4})/i) ||
      text.match(/End Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const leaseEndDate = leaseEndDateMatch ? leaseEndDateMatch[1] : 'Not found';

    const paymentMatch = text.match(/Monthly Payment:\s*£?([\d,]+(?:\.\d{2})?)/i);
    const monthlyPayment = paymentMatch
      ? parseFloat(paymentMatch[1].replace(',', ''))
      : 0;

    const settlementCost = calculateSettlementCost(leaseEndDate, monthlyPayment);

    return { leaseEndDate, monthlyPayment, settlementCost };
  } catch (error) {
    console.error('❌ Error processing PDF:', error.message);
    return { error: 'Failed to process PDF' };
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
        const leaseEndDate =
          results[0]?.['Lease End Date'] ||
          results[0]?.['End Date'] ||
          'Not found';
        const monthlyPayment = results[0]?.['Monthly Payment']
          ? parseFloat(results[0]['Monthly Payment'])
          : 0;

        const settlementCost = calculateSettlementCost(leaseEndDate, monthlyPayment);

        resolve({ leaseEndDate, monthlyPayment, settlementCost });
      })
      .on('error', (error) => {
        console.error('❌ Error processing CSV:', error.message);
        reject({ error: 'Failed to process CSV file' });
      });
  });
};

// ✅ Extract Data from Excel (New)
export const extractFromExcel = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ERROR: File not found: ${filePath}`);
      return { error: 'File not found' };
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const leaseEndDate =
      data[0]?.['Lease End Date'] ||
      data[0]?.['End Date'] ||
      'Not found';

    const monthlyPayment = data[0]?.['Monthly Payment']
      ? parseFloat(data[0]['Monthly Payment'])
      : 0;

    const settlementCost = calculateSettlementCost(leaseEndDate, monthlyPayment);

    return { leaseEndDate, monthlyPayment, settlementCost };
  } catch (error) {
    console.error('❌ Error processing Excel:', error.message);
    return { error: 'Failed to process Excel file' };
  }
};

// ✅ Function to Calculate Settlement Cost
const calculateSettlementCost = (leaseEndDate, monthlyPayment) => {
  if (leaseEndDate === 'Not found' || monthlyPayment === 0) {
    return {
      leaseEndDate: 'Missing in document',
      monthlyPayment: 'Missing in document',
      settlementCost: 'No lease data available',
    };
  }

  try {
    const leaseEnd = new Date(leaseEndDate);
    const today = new Date();

    const remainingMonths =
      (leaseEnd.getFullYear() - today.getFullYear()) * 12 +
      (leaseEnd.getMonth() - today.getMonth());

    if (remainingMonths <= 0) {
      return 'Lease already ended';
    }

    const settlementCost = Math.round(remainingMonths * monthlyPayment * 0.8);
    return `£${settlementCost}`;
  } catch (error) {
    console.error('❌ Error calculating settlement cost:', error.message);
    return 'Error in calculation';
  }
};
