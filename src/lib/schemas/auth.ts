import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().email('邮箱格式不正确 / Invalid email'),
  password: z.string().min(6, '密码至少 6 位 / Password must be at least 6 chars'),
})
export type SignInInput = z.infer<typeof signInSchema>

export const signUpSchema = z.object({
  email: z.string().email('邮箱格式不正确 / Invalid email'),
  password: z
    .string()
    .min(8, '密码至少 8 位 / Password must be at least 8 chars')
    .regex(/\d/, '密码需包含数字 / Password must include a number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: '两次密码不一致 / Passwords do not match',
  path: ['confirmPassword'],
})
export type SignUpInput = z.infer<typeof signUpSchema>
