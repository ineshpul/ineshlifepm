#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Runs `block` and returns YES. On NSException, returns NO and optionally sets *outError.
FOUNDATION_EXPORT BOOL EXDualCameraTryBlock(
  void (NS_NOESCAPE ^ _Nonnull block)(void),
  NSError * _Nullable * _Nullable outError
);

NS_ASSUME_NONNULL_END
