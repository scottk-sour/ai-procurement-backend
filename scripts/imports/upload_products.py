from pymongo import MongoClient
import pandas as pd

# Connect to MongoDB Atlas
client = MongoClient("mongodb+srv://kinder1975sd:Seren2010@cluster0.mpjodzz.mongodb.net/ai-procurement?retryWrites=true&w=majority")
db = client["ai-procurement"]
collection = db["vendorproducts"]

def insert_products(csv_file, vendor_id):
    """
    Reads a CSV file and inserts product data into MongoDB under a given vendor.
    """
    try:
        df = pd.read_csv(csv_file)

        # Map CSV columns to MongoDB fields
        products = []
        for _, row in df.iterrows():
            product = {
                "vendor": vendor_id,
                "manufacturer": row["Manufacturer"],
                "model": row["Model"],
                "speed": row["Speed"],
                "description": row["Description"],
                "cost": row["Cost"],
                "installation": row["Installation"],
                "profit_margin": row["Profit Margin"],
                "min_volume": row["Min Volume"],
                "max_volume": row["Max Volume"],
                "total_machine_cost": row["Total Machine Cost"],
            }
            products.append(product)

        if products:
            collection.insert_many(products)
            print(f"✅ Inserted {len(products)} products from {csv_file} for Vendor {vendor_id}.")

    except Exception as e:
        print(f"❌ Error processing {csv_file}: {e}")

# Upload data for each vendor
insert_products("Canon_Pricing_Table.csv", "67916a0d2de3001c450d5a17")  # Tim - PrintSmart Solutions
insert_products("Sharp_Pricing_Table.csv", "67916a3f2de3001c450d5a1a")  # Jo - RapidCopiers
insert_products("Konica_Minolta_Pricing_Table.csv", "67916a6e2de3001c450d5a1d")  # Mo - EcoPrint Systems
insert_products("Ricoh_Pricing_Table.csv", "67916aaf2de3001c450d5a20")  # Tony - ProPrint Solutions
insert_products("Xerox_Pricing_Table.csv", "67916af32de3001c450d5a23")  # Adam - AdvancedCopiers UK
