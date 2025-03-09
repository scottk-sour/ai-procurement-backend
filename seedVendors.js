const mongoose = require('mongoose');
const Vendor = require('./models/Vendor'); // Adjust the path to your Vendor model

// Connect to your MongoDB database
mongoose.connect('mongodb://localhost:27017/your-database-name', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Sample vendor data
const vendors = [
  {
    name: 'ABC Security Solutions',
    company: 'ABC Security Solutions Ltd',
    email: 'abcsecurity@example.com',
    password: 'hashed_password', // Use hashed passwords in real-world applications
    services: ['CCTV', 'IT'],
    pricing: { CCTV: 500, IT: 300 },
    uploads: ['/uploads/abc_catalog.pdf'],
    location: 'London',
    contactInfo: '+44 123 456 7890',
    rating: 4.5,
  },
  {
    name: 'SmartCopiers Ltd',
    company: 'SmartCopiers Ltd',
    email: 'smartcopiers@example.com',
    password: 'hashed_password',
    services: ['Photocopiers'],
    pricing: { Photocopiers: 200 },
    uploads: ['/uploads/smartcopiers_catalog.pdf'],
    location: 'Birmingham',
    contactInfo: '+44 987 654 3210',
    rating: 4.7,
  },
  {
    name: 'XYZ Telecoms',
    company: 'XYZ Telecoms Ltd',
    email: 'xyztelecoms@example.com',
    password: 'hashed_password',
    services: ['Telecoms', 'IT'],
    pricing: { Telecoms: 300, IT: 250 },
    uploads: ['/uploads/xyz_catalog.pdf'],
    location: 'Manchester',
    contactInfo: '+44 111 222 3333',
    rating: 4.2,
  },
  {
    name: 'Elite IT Solutions',
    company: 'Elite IT Solutions Ltd',
    email: 'eliteit@example.com',
    password: 'hashed_password',
    services: ['IT'],
    pricing: { IT: 350 },
    uploads: ['/uploads/eliteit_catalog.pdf'],
    location: 'Edinburgh',
    contactInfo: '+44 444 555 6666',
    rating: 4.8,
  },
  {
    name: 'Guardian CCTV Systems',
    company: 'Guardian CCTV Systems Ltd',
    email: 'guardiancctv@example.com',
    password: 'hashed_password',
    services: ['CCTV'],
    pricing: { CCTV: 450 },
    uploads: ['/uploads/guardiancctv_catalog.pdf'],
    location: 'Glasgow',
    contactInfo: '+44 777 888 9999',
    rating: 4.3,
  },
  {
    name: 'NextGen Telecom',
    company: 'NextGen Telecom Ltd',
    email: 'nextgentelecom@example.com',
    password: 'hashed_password',
    services: ['Telecoms'],
    pricing: { Telecoms: 400 },
    uploads: ['/uploads/nextgentelecom_catalog.pdf'],
    location: 'Liverpool',
    contactInfo: '+44 222 333 4444',
    rating: 4.6,
  },
  {
    name: 'Sharp Imaging Solutions',
    company: 'Sharp Imaging Solutions Ltd',
    email: 'sharpimaging@example.com',
    password: 'hashed_password',
    services: ['Photocopiers'],
    pricing: { Photocopiers: 250 },
    uploads: ['/uploads/sharpimaging_catalog.pdf'],
    location: 'Leeds',
    contactInfo: '+44 555 666 7777',
    rating: 4.4,
  },
  {
    name: 'TechMasters IT',
    company: 'TechMasters IT Ltd',
    email: 'techmasters@example.com',
    password: 'hashed_password',
    services: ['IT'],
    pricing: { IT: 400 },
    uploads: ['/uploads/techmasters_catalog.pdf'],
    location: 'Cardiff',
    contactInfo: '+44 888 999 0000',
    rating: 4.9,
  },
  {
    name: 'Photon Copier Solutions',
    company: 'Photon Copier Solutions Ltd',
    email: 'photoncopiers@example.com',
    password: 'hashed_password',
    services: ['Photocopiers'],
    pricing: { Photocopiers: 300 },
    uploads: ['/uploads/photoncopiers_catalog.pdf'],
    location: 'Sheffield',
    contactInfo: '+44 111 222 3333',
    rating: 4.1,
  },
  {
    name: 'Signal Telecom Services',
    company: 'Signal Telecom Services Ltd',
    email: 'signaltelecom@example.com',
    password: 'hashed_password',
    services: ['Telecoms', 'CCTV'],
    pricing: { Telecoms: 350, CCTV: 400 },
    uploads: ['/uploads/signaltelecom_catalog.pdf'],
    location: 'Bristol',
    contactInfo: '+44 666 777 8888',
    rating: 4.5,
  },
];

// Function to seed vendors
const seedVendors = async () => {
  try {
    // Clear existing vendors (optional)
    await Vendor.deleteMany();

    // Insert the sample vendor data
    await Vendor.insertMany(vendors);
    console.log('Vendors seeded successfully!');
  } catch (error) {
    console.error('Error seeding vendors:', error.message);
  } finally {
    mongoose.connection.close(); // Close the database connection
  }
};

// Run the seed function
seedVendors();

