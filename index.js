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
    // await client.connect();

    const db = client.db("medicare");
    const userCollection = db.collection("user");
    const paymentCollection = db.collection("payments");
    const doctorCollection = db.collection("doctors");
    const appointmentCollection = db.collection("appointments");
    const reviewCollection = db.collection("reviews");
    const prescriptionCollection = db.collection("prescriptions");
    const sessionCollection = db.collection("session");

    // JWT

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userSession = await sessionCollection.findOne({ token });
      if (!userSession) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await userCollection.findOne({ _id: userSession.userId });
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      req.user = user;

      next();
    };

    const isAdmin = async (req, res, next) => {
      const user = req.user;
      if (user.role !== "admin") {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };
    const isDoctor = async (req, res, next) => {
      const user = req.user;
      if (user.role !== "doctor") {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };
    const isPatient = async (req, res, next) => {
      const user = req.user;
      if (user.role !== "patient") {
        return res.status(403).json({ message: "forbidden access" });
      }
      next();
    };

    // GET REQUESTS

    // getting all users
    app.get("/api/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.json(result);
    });

    // get all doctors
    app.get("/api/all-doctors", async (req, res) => {
      const matchStage = { verificationStatus: "approved" };

      if (req.query.specialization) {
        matchStage.specialization = req.query.specialization;
      }

      if (req.query.search) {
        matchStage.$or = [
          { doctorName: { $regex: req.query.search, $options: "i" } },
          { specialization: { $regex: req.query.search, $options: "i" } },
        ];
      }

      const pipeline = [
        { $match: matchStage },
        {
          $addFields: {
            consultationFeeNum: {
              $convert: {
                input: "$consultationFee",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
            experienceNum: {
              $convert: {
                input: "$experience",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
            ratingNum: {
              $convert: {
                input: "$rating",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      ];

      let sortStage = {};
      switch (req.query.sortBy) {
        case "price-low-high":
          sortStage = { consultationFeeNum: 1 };
          break;
        case "price-high-low":
          sortStage = { consultationFeeNum: -1 };
          break;
        case "experience":
          sortStage = { experienceNum: -1 };
          break;
        case "rating":
          sortStage = { ratingNum: -1 };
          break;
      }

      if (Object.keys(sortStage).length > 0) {
        pipeline.push({ $sort: sortStage });
      }
      console.log("matchStage:", JSON.stringify(matchStage));
      console.log("pipeline:", JSON.stringify(pipeline));

      try {
        if (req.query.page) {
          const page = Number(req.query.page);
          const itemsPerPage = Number(req.query.itemsPerPage) || 8;
          const skipPage = (page - 1) * itemsPerPage;
          const totalDoctor = await doctorCollection.countDocuments(matchStage);
          const paginationResult = await doctorCollection
            .aggregate(pipeline)
            .skip(skipPage)
            .limit(itemsPerPage)
            .toArray();
          return res.json({ paginationResult, totalDoctor });
        }

        const result = await doctorCollection.aggregate(pipeline).toArray();
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    // get all doctors for admin
    app.get(
      "/api/all-doctors/admin",
      verifyToken,
      isAdmin,
      async (req, res) => {
        const result = await doctorCollection.find().toArray();
        res.json(result);
      },
    );

    // get doctor data by email
    app.get("/api/doctor", verifyToken, async (req, res) => {
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
    app.get(
      "/api/appointment/self",
      verifyToken,
      isPatient,
      async (req, res) => {
        const { patientId } = req.query;
        if (patientId !== req.user._id.toString()) {
          return res.status(403).json({ message: "forbidden access" });
        }
        const result = await appointmentCollection
          .find({ patientId })
          .toArray();
        res.json(result);
      },
    );

    // get payments by patient id
    app.get("/api/payments", verifyToken, isPatient, async (req, res) => {
      const { patientId } = req.query;
      if (patientId !== req.user._id.toString()) {
        return res.status(403).json({ message: "forbidden access" });
      }
      const result = await paymentCollection.find({ patientId }).toArray();
      res.json(result);
    });

    // get payment history by id
    app.get("/api/all-payments", verifyToken, isAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $addFields: {
              patientIdObj: { $toObjectId: "$patientId" },
            },
          },
          {
            $lookup: {
              from: "user",
              localField: "patientIdObj",
              foreignField: "_id",
              as: "patientInfo",
            },
          },
          { $unwind: "$patientInfo" },
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: ["$$ROOT", { patientName: "$patientInfo.name" }],
              },
            },
          },
          {
            $project: {
              patientInfo: 0,
              patientIdObj: 0,
            },
          },
        ])
        .toArray();

      res.json(result);
    });

    // get reviews for specific patient
    app.get("/api/review", async (req, res) => {
      const { id } = req.query;
      const result = await reviewCollection.find({ patientId: id }).toArray();
      res.json(result);
    });

    // get all reviews
    app.get("/api/all-reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.json(result);
    });

    // get reviews for specific doctor
    app.get("/api/review/doctor", async (req, res) => {
      const { email } = req.query;
      const getDoctorId = await doctorCollection.findOne({
        doctorEmail: email,
      });

      if (!getDoctorId) {
        return res.status(404).json({ message: "Doctor not found" });
      }
      const result = await reviewCollection
        .find({ doctorId: getDoctorId._id.toString() })
        .toArray();
      const avgRatingInReview =
        result.length > 0
          ? result.reduce((acc, review) => acc + Number(review.rating), 0) /
            result.length
          : 0;
      const filter = { _id: getDoctorId._id };
      const updatedField = {
        $set: {
          rating: avgRatingInReview.toFixed(2),
        },
      };
      const updateRatingInDoctorCollecetion = await doctorCollection.updateOne(
        filter,
        updatedField,
      );
      res.json({ result, avgRatingInReview });
    });

    // get appointments by doctor id
    app.get("/api/appointment", verifyToken, isDoctor, async (req, res) => {
      const { email } = req.query;
      if (email !== req.user.email) {
        return res.status(403).json({ message: "forbidden access" });
      }
      const getDoctorId = await doctorCollection.findOne({
        doctorEmail: email,
      });

      if (!getDoctorId) {
        return res.status(404).json({ message: "Doctor not found" });
      }
      const result = await appointmentCollection
        .find({ doctorId: getDoctorId._id.toString() })
        .toArray();
      res.json(result);
    });

    // get all appoitments
    app.get("/api/appointments", async (req, res) => {
      const result = await appointmentCollection.find().toArray();
      res.json(result);
    });

    // gettign prescription by doctor id
    app.get("/api/prescription", verifyToken, isDoctor, async (req, res) => {
      const { email } = req.query;
      const getDoctorId = await doctorCollection.findOne({
        doctorEmail: email,
      });

      if (!getDoctorId) {
        return res.status(404).json({ message: "Doctor not found" });
      }
      const result = await prescriptionCollection
        .find({ doctorId: getDoctorId._id.toString() })
        .toArray();
      res.json(result);
    });

    // POST REQUESTS

    // store doctor data after register
    app.post("/api/doctors", verifyToken, isDoctor, async (req, res) => {
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
        verificationStatus: "pending",
        rating: 0,
      };
      const result = await doctorCollection.insertOne(doctorData);
      res.json(result);
    });

    // creating appointment
    app.post("/api/appointment", verifyToken, isPatient, async (req, res) => {
      const data = req.body;
      const isConfirmed = await appointmentCollection.findOne({
        doctorId: data.doctorId,
        appointmentDate: data.appointmentDate,
        appointmentTime: data.appointmentTime,
        appointmentStatus: "confirmed",
      });
      if (isConfirmed) {
        return res.json({ message: "Slot is already booked, try other slots" });
      }
      const result = await appointmentCollection.insertOne(data);
      res.json(result);
    });

    // creating payments
    app.post("/api/payment", verifyToken, isPatient, async (req, res) => {
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

    // creating review
    app.post("/api/review/new", verifyToken, isPatient, async (req, res) => {
      const data = req.body;
      const review = {
        ...data,
        createdAt: new Date(),
      };
      const result = await reviewCollection.insertOne(review);
      const getRatingFromReview = await reviewCollection.findOne({
        _id: result.insertedId,
      });
      const filter = { _id: new ObjectId(data.doctorId) };
      const isRating = await doctorCollection.findOne(filter);
      if (isRating.rating === 0) {
        const updatedField = {
          $set: {
            rating: Number(getRatingFromReview.rating),
          },
        };
        const setRatingInDoctorCollection = await doctorCollection.updateOne(
          filter,
          updatedField,
        );
      }
      res.json(result);
    });

    // creating prescription
    app.post(
      "/api/prescription/new",
      verifyToken,
      isDoctor,
      async (req, res) => {
        const data = req.body;
        const review = {
          ...data,
          createdAt: new Date(),
        };
        const result = await prescriptionCollection.insertOne(review);
        if (result) {
          const filter = { _id: new ObjectId(data.appointmentId) };
          const updatedField = {
            $set: {
              appointmentStatus: "completed",
            },
          };
          const update = await appointmentCollection.updateOne(
            filter,
            updatedField,
          );
        }
        res.json(result);
      },
    );

    // PATCH REQUESTS

    // updating user data
    app.patch("/api/user/profile", verifyToken, isPatient, async (req, res) => {
      const { userId, name, email, image, phone } = req.body;
      if (userId !== req.user._id.toString()) {
        return res.status(403).json({ message: "forbidden access" });
      }
      const filter = { _id: new ObjectId(userId) };
      const updatedData = {
        $set: {
          name,
          email,
          image,
          phone,
          updatedAt: new Date(),
        },
      };
      const result = await userCollection.updateOne(filter, updatedData);
      res.json(result);
    });

    // edit doctor data
    app.patch(
      "/api/doctor/profile/edit",
      verifyToken,
      isDoctor,
      async (req, res) => {
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
        if (newData.email !== req.user.email) {
          return res.status(403).json({ message: "forbidden access" });
        }
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
      },
    );

    // accepting appointment by doctor
    app.patch(
      "/api/appointment/accept",
      verifyToken,
      isDoctor,
      async (req, res) => {
        const { appointmentId } = req.query;
        const filter = { _id: new ObjectId(appointmentId) };
        const updatedData = {
          $set: {
            appointmentStatus: "confirmed",
          },
        };
        const result = await appointmentCollection.updateOne(
          filter,
          updatedData,
        );
        res.json(result);
      },
    );

    // cancelling appointment

    app.patch("/api/appointment/cancel", verifyToken, async (req, res) => {
      const { appointmentId } = req.query;
      const filter = { _id: new ObjectId(appointmentId) };
      const updatedData = {
        $set: {
          appointmentStatus: "cancelled",
        },
      };
      const result = await appointmentCollection.updateOne(filter, updatedData);
      res.json(result);
    });

    // rescheduling appointment

    app.patch(
      "/api/appointment/reschedule",
      verifyToken,
      isPatient,
      async (req, res) => {
        const { appointmentDate, appointmentTime, appointmentId } = req.body;
        const filter = { _id: new ObjectId(appointmentId) };
        const updatedData = {
          $set: {
            appointmentDate,
            appointmentTime,
          },
        };
        const result = await appointmentCollection.updateOne(
          filter,
          updatedData,
        );
        res.json(result);
      },
    );

    // editing review
    app.patch("/api/review/edit", verifyToken, isPatient, async (req, res) => {
      const { rating, reviewText, reviewId } = req.body;
      const filter = { _id: new ObjectId(reviewId) };
      const updatedData = {
        $set: {
          rating,
          reviewText,
        },
      };
      const result = await reviewCollection.updateOne(filter, updatedData);
      res.json(result);
    });

    // modify prescription
    app.patch(
      "/api/prescription/modify",
      verifyToken,
      isDoctor,
      async (req, res) => {
        const { diagnosis, medications, instructions, prescriptionId } =
          req.body;
        const filter = { _id: new ObjectId(prescriptionId) };
        const updatedField = {
          $set: {
            diagnosis,
            medications,
            instructions,
          },
        };
        const result = await prescriptionCollection.updateOne(
          filter,
          updatedField,
        );
        res.json(result);
      },
    );

    // suspend user
    app.patch("/api/user/suspend", verifyToken, isAdmin, async (req, res) => {
      const { userId } = req.body;
      const filter = { _id: new ObjectId(userId) };
      const updatedField = {
        $set: {
          status: "suspended",
        },
      };
      const result = await userCollection.updateOne(filter, updatedField);
      res.json(result);
    });

    // unsuspend user
    app.patch("/api/user/unsuspend", verifyToken, isAdmin, async (req, res) => {
      const { userId } = req.body;
      const filter = { _id: new ObjectId(userId) };
      const updatedField = {
        $set: {
          status: "active",
        },
      };
      const result = await userCollection.updateOne(filter, updatedField);
      res.json(result);
    });

    // rejecting a doctor
    app.patch("/api/doctor/reject", verifyToken, isAdmin, async (req, res) => {
      const { doctorId } = req.body;
      const filter = { _id: new ObjectId(doctorId) };
      const updatedField = {
        $set: {
          verificationStatus: "rejected",
        },
      };
      const result = await doctorCollection.updateOne(filter, updatedField);
      res.json(result);
    });

    // cancelling a doctor
    app.patch("/api/doctor/cancel", verifyToken, isAdmin, async (req, res) => {
      const { doctorId } = req.body;
      const filter = { _id: new ObjectId(doctorId) };
      const updatedField = {
        $set: {
          verificationStatus: "cancelled",
        },
      };
      const result = await doctorCollection.updateOne(filter, updatedField);
      res.json(result);
    });

    // approving a doctor
    app.patch("/api/doctor/approve", verifyToken, isAdmin, async (req, res) => {
      const { doctorId } = req.body;
      const filter = { _id: new ObjectId(doctorId) };
      const updatedField = {
        $set: {
          verificationStatus: "approved",
        },
      };
      const result = await doctorCollection.updateOne(filter, updatedField);
      res.json(result);
    });

    // DELETE REQUESTS

    // delete review
    app.delete(
      "/api/review/delete",
      verifyToken,
      isPatient,
      async (req, res) => {
        const { reviewId } = req.body;
        const result = await reviewCollection.deleteOne({
          _id: new ObjectId(reviewId),
        });
        res.json(result);
      },
    );

    // delete user
    app.delete("/api/user/delete", verifyToken, isAdmin, async (req, res) => {
      const { userId, userEmail } = req.body;
      // delete user from doctorCollection if role === doctor
      const findUserInUserCollection = await userCollection.findOne({
        _id: new ObjectId(userId),
      });
      if (findUserInUserCollection.role === "doctor") {
        const deleteUserFromDoctorCollection = await doctorCollection.deleteOne(
          { doctorEmail: userEmail },
        );
      }
      const result = await userCollection.deleteOne({
        _id: new ObjectId(userId),
      });
      res.json(result);
    });

    // await client.db("admin").command({ ping: 1 });
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
