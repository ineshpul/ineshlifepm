#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Catch Objective-C NSExceptions so they never cross the TurboModule boundary.
@interface EXDualCameraExceptionCatcher : NSObject

+ (BOOL)tryBlock:(NS_NOESCAPE void (^)(void))block error:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END

