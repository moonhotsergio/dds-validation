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
    poNumber: Joi.string().min(1).max(255).optional().allow(''),
    deliveryId: Joi.string().min(1).max(255).optional().allow(''),
    deliveryPostcode: Joi.string().min(3).max(10).required(),
    referenceNumber: Joi.string().min(1).max(255).required(),
    validationNumber: Joi.string().max(255).optional().allow('')
}).custom((value, helpers) => {
    // Ensure either PO Number OR Delivery ID is provided
    if ((!value.poNumber || value.poNumber === '') && (!value.deliveryId || value.deliveryId === '')) {
        return helpers.error('any.invalid', { message: 'Either PO Number or Delivery ID is required' });
    }
    return value;
});

export const bulkSubmissionSchema = Joi.array().items(referenceSubmissionSchema).min(1).max(100);

export const customerAccessSchema = Joi.object({
    poNumber: Joi.string().min(1).max(255).optional().allow(''),
    deliveryId: Joi.string().min(1).max(255).optional().allow(''),
    postcode: Joi.string().min(3).max(10).optional(),
    email: Joi.string().email().optional()
}).custom((value, helpers) => {
    // Ensure either PO Number OR Delivery ID is provided
    if ((!value.poNumber || value.poNumber === '') && (!value.deliveryId || value.deliveryId === '')) {
        return helpers.error('any.invalid', { message: 'Either PO Number or Delivery ID is required' });
    }
    
    // Ensure either postcode OR email is provided
    if ((!value.postcode || value.postcode === '') && (!value.email || value.email === '')) {
        return helpers.error('any.invalid', { message: 'Either postcode or email is required' });
    }
    
    return value;
});

export const shareableLinkSchema = Joi.object({
    poNumber: Joi.string().min(1).max(255).required(),
    deliveryId: Joi.string().min(1).max(255).optional().allow(''),
    password: Joi.string().min(4).max(50).optional(),
    expiresInHours: Joi.number().min(1).max(168).default(24) // Max 1 week
});