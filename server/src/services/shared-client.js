const SHARED_API = process.env.SHARED_API_URL || 'http://localhost:5002';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

const headers = {
  'Content-Type': 'application/json',
  'x-service-key': SERVICE_KEY,
};

async function apiCall(method, path, body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${SHARED_API}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || 'Shared API error');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const sharedClient = {
  // ─── Auth ───
  async login(credentials) {
    return apiCall('POST', '/api/v1/auth/login', credentials);
  },

  async validateToken(token) {
    return apiCall('POST', '/api/v1/auth/validate', { token });
  },

  // ─── People ───
  async getPeople(filters = {}) {
    const params = new URLSearchParams(filters);
    return apiCall('GET', `/api/v1/people?${params}`);
  },

  async getPerson(id) {
    return apiCall('GET', `/api/v1/people/${id}`);
  },

  async createPerson(data) {
    return apiCall('POST', '/api/v1/people', data);
  },

  async updatePerson(id, data) {
    return apiCall('PUT', `/api/v1/people/${id}`, data);
  },

  async deletePerson(id) {
    return apiCall('DELETE', `/api/v1/people/${id}`);
  },

  async admitStudent(data) {
    return apiCall('POST', '/api/v1/people/admit', data);
  },

  // ─── Classes ───
  async getClasses(campusId) {
    const params = campusId ? `?campus_id=${campusId}` : '';
    return apiCall('GET', `/api/v1/classes${params}`);
  },

  async getClass(id) {
    return apiCall('GET', `/api/v1/classes/${id}`);
  },

  async createClass(data) {
    return apiCall('POST', '/api/v1/classes', data);
  },

  async getClassSections(classId) {
    return apiCall('GET', `/api/v1/classes/${classId}/sections`);
  },

  async createSection(classId, data) {
    return apiCall('POST', `/api/v1/classes/${classId}/sections`, data);
  },

  async getClassSubjects(classId) {
    return apiCall('GET', `/api/v1/classes/${classId}/subjects`);
  },

  async createSubject(classId, data) {
    return apiCall('POST', `/api/v1/classes/${classId}/subjects`, data);
  },

  // ─── Campuses ───
  async getCampuses() {
    return apiCall('GET', '/api/v1/campuses');
  },

  async getCampus(id) {
    return apiCall('GET', `/api/v1/campuses/${id}`);
  },

  async createCampus(data) {
    return apiCall('POST', '/api/v1/campuses', data);
  },

  async updateCampus(id, data) {
    return apiCall('PUT', `/api/v1/campuses/${id}`, data);
  },

  async deleteCampus(id) {
    return apiCall('DELETE', `/api/v1/campuses/${id}`);
  },

  // ─── Sync ───
  async syncIncremental(lastSync, types) {
    const params = new URLSearchParams();
    if (lastSync) params.set('after', lastSync);
    if (types) params.set('types', types);
    return apiCall('GET', `/api/v1/sync?${params}`);
  },

  async syncFull(types) {
    const params = types ? `?types=${types}` : '';
    return apiCall('GET', `/api/v1/sync/full${params}`);
  },
};

export default sharedClient;
