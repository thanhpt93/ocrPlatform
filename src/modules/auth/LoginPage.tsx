import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { authApi } from '@/services/api/endpoints';
import { api } from '@/services/api/client';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { syncWithBackend } = usePlatformStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await authApi.login({ email, password });
      // Clear old cached mock state
      localStorage.removeItem('ocr_platform_state_v1');

      api.setTokens(res.access_token, res.refresh_token, {
        id: res.user_id,
        email: res.email,
        full_name: res.full_name,
        role: res.role,
      });
      usePlatformStore.setState({
        currentUser: api.getCurrentUser(),
        activeCustomerId: res.user_id,
        subscriptions: [],
        licenses: [],
        orders: [],
        jobs: [],
        invoices: [],
        payments: [],
        dailyStats: [],
      });
      await syncWithBackend();
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex h-12 w-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-4">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          ocr<span className="text-blue-400">Platform</span>
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Sign in to your customer account to access OCR microservices & API licenses
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/90 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-700/80 backdrop-blur-md">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-900/40 border border-red-500/50 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@techcorp.io"
                  className="w-full bg-slate-900/80 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900/80 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading}
                variant="primary"
                className="w-full justify-center py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-700/60 text-center text-xs text-slate-400">
            <span>Don't have an account yet? </span>
            <Link to="/register" className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
