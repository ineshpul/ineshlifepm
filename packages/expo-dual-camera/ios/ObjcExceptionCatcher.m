#import "ObjcExceptionCatcher.h"

@implementation ObjcExceptionCatcher

+ (BOOL)tryWithBlock:(void (^)(void))block outError:(NSError **)outError
{
  @try {
    block();
    return YES;
  } @catch (NSException *exception) {
    if (outError) {
      NSString *domain = @"expo.dual.camera.ns_exception";
      NSDictionary *userInfo = @{
        NSLocalizedDescriptionKey: exception.reason ?: @"Native NSException",
        @"name": exception.name ?: @"NSException",
      };
      *outError = [NSError errorWithDomain:domain code:1 userInfo:userInfo];
    }
    return NO;
  }
}

@end
