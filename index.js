const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.a82ocix.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("medicare");
    const userCollection = db.collection("user");
    const doctorCollection = db.collection("doctors");
    const appointmentCollection = db.collection("appointments");
    const paymentCollection = db.collection("payments");

    // GET REQUESTS

    // get all doctors
    app.get("/api/all-doctors", async (req, res) => {
      const result = await doctorCollection.find().toArray();
      res.json(result);
    });

    // get doctor data by email
    app.get("/api/doctor", async (req, res) => {
      const { email } = req.query;
      const result = await doctorCollection.findOne({ doctorEmail: email });
      res.json(result);
    });

    // get doctor data by id
    app.get("/api/doctor/:id", async (req, res) => {
      const { id } = req.params;
      const result = await doctorCollection.findOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // get all appointments made by individual patient
    app.get("/api/appointment/self", async (req, res) => {
      const { patientId } = req.query;
      const result = await appointmentCollection.find({ patientId }).toArray();
      res.json(result);
    });

    // get payment history by id
    app.get("/api/payments", async (req, res) => {
      const { patientId } = req.query;
      const result = await paymentCollection.find({ patientId }).toArray();
      res.json(result);
    });

    // POST REQUESTS

    // store doctor data after register
    app.post("/api/doctors", async (req, res) => {
      const newData = req.body;
      const doctorData = {
        createdAt: new Date(),
        updatedAt: new Date(),
        doctorName: newData.fullName,
        doctorEmail: newData.email,
        specialization: "",
        qualifications: "",
        consultationFee: "",
        hospitalName: "",
        profileImage: newData.image,
        availableDays: [],
        availableSlots: [],
        experience: "",
        phone: newData.phone,
        bio: "",
        verificationStatus: "approved",
      };
      const result = await doctorCollection.insertOne(doctorData);
      res.json(result);
    });

    // creating appointment
    app.post("/api/appointment", async (req, res) => {
      const data = req.body;
      const result = await appointmentCollection.insertOne(data);
      res.json(result);
    });

    // creating payments
    app.post("/api/payment", async (req, res) => {
      const data = req.body;
      const result = await paymentCollection.insertOne(data);
      if (result) {
        const findAppointment = { _id: new ObjectId(data.appointmentId) };
        const updatePaymentStatus = {
          $set: {
            paymentStatus: "paid",
          },
        };
        const update = await appointmentCollection.updateOne(
          findAppointment,
          updatePaymentStatus,
        );
        if (update) {
          res.json(result);
        }
      }
    });

    // PATCH REQUESTS

    // edit doctor data
    app.patch("/api/doctor/profile/edit", async (req, res) => {
      const newData = req.body;
      const {
        qualifications,
        consultationFee,
        hospitalName,
        specialization,
        phone,
        bio,
        experience,
        availableDays,
        availableSlots,
      } = newData;
      const profileData = {
        qualifications,
        consultationFee,
        hospitalName,
        specialization,
        phone,
        bio,
        experience,
      };
      const scheduleData = {
        availableDays,
        availableSlots,
      };
      const filter = { doctorEmail: newData.email };
      let updatedData;
      if (typeof availableDays !== "undefined") {
        updatedData = {
          $set: {
            ...scheduleData,
            updatedAt: new Date(),
          },
        };
      } else {
        updatedData = {
          $set: {
            ...profileData,
            updatedAt: new Date(),
          },
        };
      }
      const result = await doctorCollection.updateOne(filter, updatedData);
      res.json(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is flying on port ${port}`);
});
