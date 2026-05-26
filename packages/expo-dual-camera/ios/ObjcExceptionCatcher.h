#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// C entry point for Swift — `NSError **` bridges reliably as the second positional argument (`&err`).
/// Class methods with `error:` labels have repeatedly failed EAS/Xcode Swift import.
FOUNDATION_EXPORT BOOL ObjcPerformCatching(
  void (NS_NOESCAPE ^ _Nonnull block)(void),
  NSError * _Nullable * _Nullable outError
);

NS_ASSUME_NONNULL_END
