import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'

// Page placeholders (will be built out Day 2+)
const Home = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-[#ff4500]">⚡ ThreadVerse</h1>
      <p className="text-gray-600 mt-2">Day 1 scaffold — frontend running ✅</p>
      
      {/* FIXED: Added the missing '<a' to the anchor tag below */}
      <a 
        href="http://localhost:5000/api/health"
        target="_blank"
        rel="noopener noreferrer" 
        className="mt-4 inline-block text-blue-600 underline"
      >
        Check API Health →
      </a>
    </div>
  </div>
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* All routes will be added Day 2+ */}
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )
}