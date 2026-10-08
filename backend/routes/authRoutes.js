const express = require("express");
const authController = require("../controllers/authController");
const {
    registerValidation,
    loginValidation,
} = require("../middleware/authValidation");

const router = express.Router();

router.post(
    "/register",
    registerValidation,
    authController.register
);

router.post(
    "/login",
    loginValidation,
    authController.login
);

module.exports = router;