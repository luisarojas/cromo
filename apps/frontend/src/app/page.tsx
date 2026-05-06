import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Stickfolio</h1>
      <p className="mt-2 text-lg text-gray-600">
        2026 FIFA World Cup Panini Sticker Tracker
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Go to Dashboard
      </Link>
    </main>
  )
}
