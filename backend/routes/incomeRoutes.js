const express = require("express");
const authenticateToken = require("../middleware/authenticateToken");
const requireRole = require("../middleware/requireRole");
const incomeController = require("../controllers/incomeController");

const router = express.Router();

router.get(
    "/",
    authenticateToken,
    requireRole("freelancer"),
    incomeController.getIncome
);

module.exports = router;