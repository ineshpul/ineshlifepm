#import "EXDualCameraExceptionCatcher.h"

BOOL EXDualCameraTryBlock(void (^block)(void), NSError **outError)
{
  @try {
    block();
    return YES;
  } @catch (NSException *exception) {
    if (outError) {
      NSString *domain = @"expo.dual.camera.ns_exception";
      NSDictionary *userInfo = @{
        NSLocalizedDescriptionKey: exception.reason ?: @"Native exception",
        @"name": exception.name ?: @"NSException",
      };
      *outError = [NSError errorWithDomain:domain code:1 userInfo:userInfo];
    }
    return NO;
  }
}
