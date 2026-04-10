/**
 * Express middleware factory for Zod request body validation.
 * Usage: app.post('/api/foo', validate(fooSchema), handler)
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: result.error.flatten(),
    });
  }
  req.body = result.data;
  next();
};
