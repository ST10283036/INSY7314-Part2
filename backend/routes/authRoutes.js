const express = require("express");
const authController = require("../controllers/authController");
const { registrationLimiter, loginLimiter } = require("../middleware/rateLimiters");
const {
    registerValidation,
    loginValidation,
} = require("../middleware/authValidation");

const router = express.Router();

router.post(
    "/register",
    registrationLimiter,
    registerValidation,
    authController.register
);

router.post(
    "/login",
    loginLimiter,
    loginValidation,
    authController.login
);

module.exports = router;
