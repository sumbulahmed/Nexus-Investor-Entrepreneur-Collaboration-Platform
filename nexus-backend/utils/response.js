const sendSuccess = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, message = 'Error', statusCode = 400, stack) => {
  const payload = { success: false, message };
  if (stack) payload.stack = stack;
  return res.status(statusCode).json(payload);
};

const sendPaginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({ success: true, message, data, pagination });
};

module.exports = { sendSuccess, sendError, sendPaginated };
