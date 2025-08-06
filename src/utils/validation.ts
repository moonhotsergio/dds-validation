import Joi from 'joi';

export const supplierEmailSchema = Joi.object({
    email: Joi.string().email().required(),
    supplierLinkId: Joi.string().uuid().required()
});

export const otpValidationSchema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    supplierLinkId: Joi.string().uuid().required()
});

export const referenceSubmissionSchema = Joi.object({
    poNumber: Joi.string().min(1).max(255).required(),
    deliveryId: Joi.string().min(1).max(255).required(),
    referenceNumber: Joi.string().min(1).max(255).required(),
    validationNumber: Joi.string().max(255).optional()
});

export const bulkSubmissionSchema = Joi.array().items(referenceSubmissionSchema).min(1).max(100);

export const customerAccessSchema = Joi.object({
    poNumber: Joi.string().min(1).max(255).required(),
    deliveryId: Joi.string().min(1).max(255).optional().allow(''),
    postcode: Joi.string().min(3).max(10).optional(),
    email: Joi.string().email().optional()
}).or('postcode', 'email');

export const shareableLinkSchema = Joi.object({
    poNumber: Joi.string().min(1).max(255).required(),
    deliveryId: Joi.string().min(1).max(255).optional().allow(''),
    password: Joi.string().min(4).max(50).optional(),
    expiresInHours: Joi.number().min(1).max(168).default(24) // Max 1 week
});