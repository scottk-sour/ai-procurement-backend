import express from "express";

const router = express.Router();

router.get("/sitemap.xml", async (req, res) => {
  const baseUrl = "https://www.tendorai.com";

  // Static pages
  const pages = [
    "/",
    "/login",
    "/how-it-works",
    "/contact",
    "/request-quote",
  ];

  // Example: dynamically include vendor pages from DB if you have a Vendor model
  // const vendorPages = await Vendor.find().map(v => `/vendor/${v.slug}`);
  // pages.push(...vendorPages);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${pages
      .map(
        (page) => `
      <url>
        <loc>${baseUrl}${page}</loc>
        <changefreq>weekly</changefreq>
        <priority>${page === "/" ? "1.0" : "0.8"}</priority>
      </url>
    `
      )
      .join("")}
  </urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

export default router;
