import { lazy, Suspense, useCallback, useState } from 'react';
import { Login } from './components/Login';
import { Uploader } from './components/Uploader';
import { useStore } from './store/useStore';
import { clearAllCached } from './lib/persistentCache';
import { LogOut, RefreshCw, Boxes, Puzzle } from 'lucide-react';
import { TableSkeleton } from './components/Skeletons';

// The data table is the heaviest component (rendering can involve hundreds
// of rows with per-cell dropdown logic) and isn't needed until a file has
// been uploaded, so it's code-split into its own chunk and loaded on demand.
const DataTable = lazy(() =>
  import('./components/DataTable').then((m) => ({ default: m.DataTable }))
);
const PartAdder = lazy(() =>
  import('./components/PartAdder').then((m) => ({ default: m.PartAdder }))
);

type Tab = 'models' | 'parts';

function App() {
  // 1. Initialize state by checking sessionStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('isLoggedIn') === 'true';
  });
  
  // Select only the one action this component needs, rather than the whole
  // store object, so App doesn't re-render on unrelated store changes
  // (upload progress, results, etc. all live in the same store).
  const setRows = useStore((s) => s.setRows);
  const refreshCrmData = useStore((s) => s.refreshCrmData);
  const isRefreshingData = useStore((s) => s.isRefreshingData);

  const [activeTab, setActiveTab] = useState<Tab>('models');

  // 2. Function to handle successful login
  const handleLoginSuccess = useCallback(() => {
    sessionStorage.setItem('isLoggedIn', 'true');
    setIsAuthenticated(true);
  }, []);

  // 3. Function to handle logout
  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('isLoggedIn');
    setIsAuthenticated(false);
    // Cached master/dynamic dropdown data is CRM-account-specific — drop it
    // on logout so the next login doesn't reuse another session's data.
    clearAllCached();
    // Optional: You could also hit your backend logout.php endpoint here if needed!
  }, []);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
          GoRevive <span className="text-orange-500 font-medium">Bulk Uploader</span>
        </h1>
        <div className="flex items-center gap-5">
          <button
            onClick={() => refreshCrmData()}
            disabled={isRefreshingData}
            title="Pull the latest brands/models/categories from the CRM — use this after adding something new in the CRM instead of reloading the page."
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshingData ? 'animate-spin' : ''}`} />
            {isRefreshingData ? 'Refreshing...' : 'Refresh CRM Data'}
          </button>
          <button 
            onClick={handleLogout}
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </nav>

      <div className="px-4 sm:px-6 lg:px-8 mt-6">
        <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md transition-colors ${
              activeTab === 'models' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Boxes className="w-4 h-4" /> Bulk Model Upload
          </button>
          <button
            onClick={() => setActiveTab('parts')}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md transition-colors ${
              activeTab === 'parts' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Puzzle className="w-4 h-4" /> Bulk Part Adder
          </button>
        </div>
      </div>

      <main className="px-4 sm:px-6 lg:px-8 mt-4">
        {activeTab === 'models' ? (
          <>
            <Uploader onDataParsed={setRows} />
            <Suspense fallback={<TableSkeleton />}>
              <DataTable />
            </Suspense>
          </>
        ) : (
          <Suspense fallback={<TableSkeleton />}>
            <PartAdder />
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default App;