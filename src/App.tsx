import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Uploader } from './components/Uploader';
import { DataTable } from './components/DataTable';
import { useStore } from './store/useStore';
import { LogOut } from 'lucide-react';

function App() {
  // 1. Initialize state by checking sessionStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('isLoggedIn') === 'true';
  });
  
  const { setRows } = useStore();

  // 2. Function to handle successful login
  const handleLoginSuccess = () => {
    sessionStorage.setItem('isLoggedIn', 'true');
    setIsAuthenticated(true);
  };

  // 3. Function to handle logout
  const handleLogout = () => {
    sessionStorage.removeItem('isLoggedIn');
    setIsAuthenticated(false);
    // Optional: You could also hit your backend logout.php endpoint here if needed!
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
          GoRevive <span className="text-orange-500 font-medium">Bulk Uploader</span>
        </h1>
        <button 
          onClick={handleLogout}
          className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </button>
      </nav>

      <main className="px-4 sm:px-6 lg:px-8 mt-8">
        <Uploader onDataParsed={(rows) => setRows(rows)} />
        <DataTable />
      </main>
    </div>
  );
}

export default App;