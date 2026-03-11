// src/api/base44Client.js

const PYTHON_URL = "https://flask-backend-ak-dusky.vercel.app/api";
// const PYTHON_URL = "http://localhost:5000/api";

const apiRequest = async (method, entity, id = null, payload = null, params = null) => {
  let url = id ? `${PYTHON_URL}/${entity}/${id}` : `${PYTHON_URL}/${entity}`;
  
  if (params) {
    const query = new URLSearchParams(params).toString();
    url += `?${query}`;
  }
  
  console.log(`🌉 Bridge: ${method} ${entity}`, { id, payload, params });

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 
        // We only set JSON content-type if we aren't sending a File/FormData
        ...(payload instanceof FormData ? {} : { 'Content-Type': 'application/json' })
      },
      body: payload instanceof FormData ? payload : (payload ? JSON.stringify(payload) : null),
    });

    if (!response.ok) return method === 'GET' ? [] : { error: "Server Error" };
    return await response.json();
  } catch (error) {
    console.error(`❌ Bridge Error (${entity}):`, error);
    return method === 'GET' ? [] : { error: "Backend Offline" };
  }
};

const createEntityHandler = (name) => ({
  create: (data) => apiRequest('POST', name, null, data),
  // bulkCreate sends an array of objects to Python
  bulkCreate: (data) => apiRequest('POST', `${name}/bulk`, null, data),
  list: (sort) => apiRequest('GET', name, null, null, sort ? { sort } : null),
  // filter helper for invoice number generation logic
  filter: (filters) => apiRequest('GET', name, null, null, filters),
  update: (id, data) => apiRequest('PATCH', name, id, data),
  delete: (id) => apiRequest('DELETE', name, id),
  deleteBarcodes: (barcodes) => apiRequest('POST', `${name}/delete-by-barcodes`, null, { barcodes }), 
});

const entitiesList = [
  'Company', 'Client', 'Invoice', 'InvoiceItem', 
  'Sales', 'GST', 'GSTMonthlyStatus', 'PaymentTracker'
];

const entities = entitiesList.reduce((acc, name) => {
  acc[name] = createEntityHandler(name);
  return acc;
}, {});

const authRequest = async (method, path, payload = null) => {
  const url = `${PYTHON_URL}/auth/${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: payload ? JSON.stringify(payload) : null,
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Auth error'), { status: response.status });
    return data;
  } catch (error) {
    throw error;
  }
};


export const base44 = {
  entities: entities,
  ...entities,
  auth: {
    me:              ()             => authRequest('GET',  'me'),
    login:           (email, pass)  => authRequest('POST', 'login',  { email, password: pass }),
    logout:          ()             => authRequest('POST', 'logout'),
    redirectToLogin: ()             => {},   // no-op, login is handled in-app now
  },
  // NEW: Support for File Uploads and AI/Data Extraction
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiRequest('POST', 'integrations/upload', null, formData);
      },
      ExtractDataFromUploadedFile: async (payload) => {
        return apiRequest('POST', 'integrations/extract', null, payload);
      }
    }
  }
};