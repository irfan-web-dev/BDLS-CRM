export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

export const scopeToCampus = (req, res, next) => {
  if (req.user.role === 'super_admin') {
    req.campusScope = {};
  } else {
    req.campusScope = { campus_id: req.user.campus_id };
  }
  next();
};
