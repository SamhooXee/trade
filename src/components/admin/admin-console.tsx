type Props = { email: string }

export function AdminConsole({ email }: Props) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-6">
        <span className="font-semibold text-gray-900">Block1 · Admin</span>
        <span className="text-sm text-gray-600">{email}</span>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Admin 控制台 / Admin Console
          </h1>
          <p className="text-gray-600">欢迎管理员 {email}</p>
        </div>
      </div>
    </main>
  )
}
