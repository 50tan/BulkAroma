import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ErrorBoundary from './components/common/ErrorBoundary';
import HomePage from './pages/HomePage';
import ComparisonPage from './pages/ComparisonPage';
import CommonMaterialsPage from './pages/CommonMaterialsPage';
import MaterialDetailPage from './pages/MaterialDetailPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import CrawlControl from './pages/admin/CrawlControl';
import MatchManagement from './pages/admin/MatchManagement';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/compare" element={<ComparisonPage />} />
            <Route path="/common-materials" element={<CommonMaterialsPage />} />
            <Route path="/material/:id" element={<MaterialDetailPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/crawl" element={<CrawlControl />} />
            <Route path="/admin/matches" element={<MatchManagement />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
