#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

static NSString *const kWidgetSnapshotKey = @"home_widget_snapshot_v1";

@interface WidgetBridge : NSObject <RCTBridgeModule>
@end

@implementation WidgetBridge

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(setHomeWidgetSnapshot,
                 setHomeWidgetSnapshot:(NSString *)snapshotJson
                 appGroupId:(NSString *)appGroupId
                 widgetKind:(NSString *)widgetKind
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (snapshotJson == nil || appGroupId == nil || appGroupId.length == 0) {
    reject(@"widget_invalid_args", @"Missing snapshot or appGroupId", nil);
    return;
  }

  NSUserDefaults *groupDefaults = [[NSUserDefaults alloc] initWithSuiteName:appGroupId];
  if (groupDefaults == nil) {
    reject(@"widget_group_unavailable", @"Could not open app group user defaults", nil);
    return;
  }

  [groupDefaults setObject:snapshotJson forKey:kWidgetSnapshotKey];
  [groupDefaults synchronize];

  resolve(@(YES));
}

RCT_REMAP_METHOD(reloadWidgets,
                 reloadWidgets:(NSString *)widgetKind
                 reloadResolver:(RCTPromiseResolveBlock)resolve
                 reloadRejecter:(RCTPromiseRejectBlock)reject)
{
  // Intentionally no-op in ObjC bridge.
  // Widget timeline refresh will occur based on timeline policy
  // or after opening/reloading the app/widget.
  resolve(@(YES));
}

@end
