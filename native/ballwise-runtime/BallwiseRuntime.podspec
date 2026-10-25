Pod::Spec.new do |s|
  s.name = 'BallwiseRuntime'
  s.version = '1.0.0'
  s.summary = 'BallWise durable iOS running recorder.'
  s.license = { :type => 'UNLICENSED' }
  s.homepage = 'https://capacitorjs.com'
  s.author = 'BallWise'
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/BallwiseRuntimePlugin/**/*.{swift,h,m,mm}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.dependency 'Capacitor'
end
