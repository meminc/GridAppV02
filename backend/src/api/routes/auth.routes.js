const express = require('express');
const { body, param } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Public routes
router.post(
  '/login',
  rateLimiter.login,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  authController.login
);

router.post(
  '/register',
  rateLimiter.register,
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
  ],
  validate,
  authController.register
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty()],
  validate,
  authController.refresh
);

router.post(
  '/forgot-password',
  rateLimiter.passwordReset,
  [body('email').isEmail().normalizeEmail()],
  validate,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  validate,
  authController.resetPassword
);

router.get(
  '/verify-email/:token',
  [param('token').notEmpty()],
  validate,
  authController.verifyEmail
);

// Protected routes
router.use(authenticate);

router.get('/me', authController.me);

router.post('/logout', authController.logout);

router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .custom((value, { req }) => value !== req.body.currentPassword)
      .withMessage('New password must be different from current password'),
  ],
  validate,
  authController.changePassword
);

router.post('/resend-verification', authController.resendVerification);

module.exports = router;