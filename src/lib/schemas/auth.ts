import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().email('errors.invalid_email_format'),
  password: z.string().min(6, 'errors.password_min_len'),
})
export type SignInInput = z.infer<typeof signInSchema>

export const signUpSchema = z.object({
  email: z.string().email('errors.invalid_email_format'),
  password: z
    .string()
    .min(8, 'errors.password_min_len_8')
    .regex(/\d/, 'errors.password_need_digit'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'errors.password_mismatch',
  path: ['confirmPassword'],
})
export type SignUpInput = z.infer<typeof signUpSchema>

