#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Objective-C `@try` / `@catch` wrapper — Swift `do`/`catch` does **not** catch `NSException`.
@interface ObjcExceptionCatcher : NSObject

/// Runs `block` under `@try`. Returns YES on success. On `NSException`, returns NO and fills `outError` when non-NULL.
+ (BOOL)tryWithBlock:(NS_NOESCAPE void (^)(void))block outError:(NSError *_Nullable *_Nullable)outError
  NS_SWIFT_NAME(try(block:outError:));

@end

NS_ASSUME_NONNULL_END
