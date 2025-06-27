import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/utils/api';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                setLoading(false);
                return;
            }

            const response = await api.get('/api/auth/me');
            setUser(response.data.user);
        } catch (error) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        try {
            const response = await api.post('/api/auth/login', { email, password });
            const { accessToken, refreshToken, user } = response.data;

            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            setUser(user);

            router.push('/dashboard');

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Login failed',
            };
        }
    };

    const logout = async () => {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            await api.post('/api/auth/logout', { refreshToken });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            setUser(null);
            router.push('/login');
        }
    };

    const register = async (userData) => {
        try {
            const response = await api.post('/api/auth/register', userData);
            const { accessToken, refreshToken, user } = response.data;

            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            setUser(user);

            router.push('/dashboard');

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Registration failed',
            };
        }
    };

    const refreshAccessToken = async () => {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');

            const response = await api.post('/api/auth/refresh', { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = response.data;

            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', newRefreshToken);

            return accessToken;
        } catch (error) {
            logout();
            throw error;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                logout,
                register,
                checkAuth,
                refreshAccessToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};