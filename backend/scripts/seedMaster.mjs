// backend/scripts/seedMaster.mjs
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/User.js"; // <- DÜZELTİLDİ

dotenv.config();

const MONGO =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/hms";

const EMAIL = "admin@btck.com";
const PASSWORD = "287388726Bt."; // sondaki nokta önemli
const NAME = "Master Admin";
const ROLE = "MASTER_ADMIN";

async function run() {
  try {
    await mongoose.connect(MONGO, { autoIndex: true });
    console.log("✓ Connected to MongoDB");

    let user = await User.findOne({ email: EMAIL });

    if (!user) {
      user = new User({ name: NAME, email: EMAIL, role: ROLE, password: PASSWORD });
      await user.save(); // modeldeki pre-save hook hashleyecek
      console.log(`✓ Created MASTER user: ${EMAIL}`);
    } else {
      user.name = NAME;
      user.role = ROLE;
      user.password = PASSWORD; // şifreyi güncelle (hook yine hashler)
      await user.save();
      console.log(`✓ Updated MASTER user & password: ${EMAIL}`);
    }
  } catch (err) {
    console.error("✗ Seed error:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
