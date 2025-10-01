import express from "express";

const router = express.Router();

router.get("/sitemap.xml", async (req, res) => {
  const baseUrl = "https://www.tendorai.com";

  const pages = [
    "/",
    "/login",
    "/how-it-works",
    "/contact",
    "/request-quote",
  ];

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
