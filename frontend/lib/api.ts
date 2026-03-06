import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
    baseURL: API_URL,
    timeout: 60000,
});

// Request interceptor to attach JWT
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// Response interceptor for 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/auth/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (data: { username: string; email: string; password: string; faceDescriptor?: number[] }) =>
        api.post('/auth/register', data),
    login: (data: { email: string; password: string }) => api.post('/auth/login', data),
    faceLogin: (data: { faceDescriptor: number[]; email?: string }) => api.post('/auth/face-login', data),
    me: () => api.get('/auth/me'),
    enrollFace: (faceDescriptor: number[]) => api.post('/auth/enroll-face', { faceDescriptor }),
};

// Recordings API
export const recordingsAPI = {
    upload: (formData: FormData, onProgress?: (pct: number) => void) =>
        api.post('/recordings/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
                if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
            },
        }),
    list: (page = 1, limit = 20) => api.get('/recordings', { params: { page, limit } }),
    get: (id: string) => api.get(`/recordings/${id}`),
    delete: (id: string) => api.delete(`/recordings/${id}`),
    download: (id: string) => api.get(`/recordings/${id}/download`, { responseType: 'blob' }),
};

// Certificates API
export const certificatesAPI = {
    get: (certId: string) => api.get(`/certificates/${certId}`),
    download: (certId: string) => api.get(`/certificates/${certId}/download`, { responseType: 'blob' }),
    list: () => api.get('/certificates'),
    addCustody: (certId: string, event: string, details?: object) =>
        api.post(`/certificates/${certId}/custody`, { event, details }),
};

// Verification API
export const verificationAPI = {
    verify: (formData: FormData) =>
        api.post('/verify', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    getLogs: (certId: string) => api.get(`/verify/logs/${certId}`),
};

// Audit API
export const auditAPI = {
    getChain: () => api.get('/audit/chain'),
    verifyChain: () => api.get('/audit/chain/verify'),
    getCertificateAudit: (certId: string) => api.get(`/audit/certificate/${certId}`),
};
