#import "EXDualCameraExceptionCatcher.h"

@implementation EXDualCameraExceptionCatcher

+ (BOOL)tryBlock:(NS_NOESCAPE void (^)(void))block error:(NSError * _Nullable * _Nullable)error
{
  @try {
    block();
    return YES;
  } @catch (NSException *exception) {
    if (error) {
      NSString *domain = @"expo.dual.camera.ns_exception";
      NSDictionary *userInfo = @{
        NSLocalizedDescriptionKey: exception.reason ?: @"Native exception",
        @"name": exception.name ?: @"NSException",
      };
      *error = [NSError errorWithDomain:domain code:1 userInfo:userInfo];
    }
    return NO;
  }
}

@end

