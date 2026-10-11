const express = require("express");
const authenticateToken = require("../middleware/authenticateToken");
const requireRole = require("../middleware/requireRole");
const { createGigValidation, gigIdValidation, updateGigValidation } = require("../middleware/gigValidation");
const gigController = require("../controllers/gigController");

const router = express.Router();

router.get("/", authenticateToken, gigController.listAvailableGigs);

router.get(
    "/mine",
    authenticateToken,
    requireRole("freelancer"),
    gigController.listMyGigs
);

router.get(
    "/:id",
    authenticateToken,
    gigIdValidation,
    gigController.getGigById
);

router.post(
    "/",
    authenticateToken,
    requireRole("freelancer"),
    createGigValidation,
    gigController.createGig
);

router.put(
    "/:id",
    authenticateToken,
    requireRole("freelancer"),
    updateGigValidation,
    gigController.updateGig
);

router.delete(
    "/:id",
    authenticateToken,
    requireRole("freelancer"),
    gigIdValidation,
    gigController.deleteGig
);

module.exports = router;