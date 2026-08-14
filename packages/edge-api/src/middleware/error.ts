import { ErrorHandler } from 'hono';
import { ZodError } from 'zod';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('[Turbopress Error]', err);

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: 'Validation Error',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      400
    );
  }

  const status = (err as any).status || 500;
  const message = err.message || 'Internal Server Error';

  return c.json(
    {
      success: false,
      error: message,
    },
    status
  );
};
