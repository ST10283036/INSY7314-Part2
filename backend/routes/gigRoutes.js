const express = require("express");
const authenticateToken = require("../middleware/authenticateToken");
const requireRole = require("../middleware/requireRole");
const { createGigValidation } = require("../middleware/gigValidation");
const gigController = require("../controllers/gigController");

const router = express.Router();

router.post(
    "/",
    authenticateToken,
    requireRole("freelancer"),
    createGigValidation,
    gigController.createGig
);

module.exports = router;