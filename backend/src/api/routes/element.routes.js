const express = require('express');
const { body, param } = require('express-validator');
const elementController = require('../controllers/element.controller');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/', elementController.getAllElements);

router.get(
    '/:id',
    [param('id').notEmpty()],
    validate,
    elementController.getElementById
);

router.post(
    '/',
    authorize('engineer', 'admin'),
    [
        body('type').isIn(['Bus', 'Line', 'Load', 'Generator', 'Transformer']),
        body('name').notEmpty(),
    ],
    validate,
    elementController.createElement
);

router.put(
    '/:id',
    authorize('engineer', 'admin'),
    [param('id').notEmpty()],
    validate,
    elementController.updateElement
);

router.delete(
    '/:id',
    authorize('admin'),
    [param('id').notEmpty()],
    validate,
    elementController.deleteElement
);

module.exports = router;