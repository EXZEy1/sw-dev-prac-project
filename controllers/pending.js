// P0 placeholders: these routes are reserved, not completed requirements.
function pending(feature) {
  return (req, res) => res.status(501).json({ success: false, code: 'FEATURE_NOT_IMPLEMENTED', message: `${feature} is reserved for the next phase.` });
}
module.exports = { pending };
