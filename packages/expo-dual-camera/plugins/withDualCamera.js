const { withInfoPlist } = require("@expo/config-plugins");

module.exports = function withDualCamera(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSCameraUsageDescription ??= "Required for dual camera.";
    mod.modResults.NSMicrophoneUsageDescription ??= "Required for video recording.";
    return mod;
  });
};
