Pod::Spec.new do |s|
  s.name = 'BallwiseCamera'
  s.version = '1.0.0'
  s.summary = 'BallWise native iOS 240 FPS capture and exact-frame extraction.'
  s.license = { :type => 'UNLICENSED' }
  s.homepage = 'https://ballwise.app'
  s.author = { 'BallWise' => 'support@ballwise.app' }
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/BallWiseCameraPlugin/**/*.{swift,h,m,mm}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.dependency 'Capacitor'
end
