const fs = require('fs');
const path = require('path');

const root = 'libraries/robotics-standard';
const fn = '$fn';

function cyl(h, r, segs = 24) {
  return `cylinder(h=${h},r=${r},${fn}=${segs})`;
}

const files = {
  'brackets/mg996r.scad': `// MG996R servo bracket
module mg996r_bracket(t=3){
  difference(){
    cube([40,20,t]);
    translate([5,10,-0.1]) ${cyl('t+0.2', 1.6)};
    translate([35,10,-0.1]) ${cyl('t+0.2', 1.6)};
    translate([20,10,-0.1]) ${cyl('t+0.2', 3.5, 32)};
  }
}
mg996r_bracket();
`,
  'brackets/sg90.scad': `module sg90_bracket(t=2.5){
  difference(){
    cube([32,12,t]);
    translate([4,6,-0.1]) ${cyl('t+0.2', 1.1, 20)};
    translate([28,6,-0.1]) ${cyl('t+0.2', 1.1, 20)};
  }
}
sg90_bracket();
`,
  'brackets/ds3218.scad': `module ds3218_bracket(t=3.5){
  difference(){
    cube([54,24,t]);
    translate([6,12,-0.1]) ${cyl('t+0.2', 1.8)};
    translate([48,12,-0.1]) ${cyl('t+0.2', 1.8)};
  }
}
ds3218_bracket();
`,
  'wheels/wheel_65mm.scad': `module wheel_65(d=65,w=20,hub=5){
  difference(){
    ${cyl('w', 'd/2', 64)};
    translate([0,0,-0.1]) ${cyl('w+0.2', 'hub', 32)};
  }
}
wheel_65();
`,
  'wheels/wheel_80mm.scad': `module wheel_80(d=80,w=22,hub=5){
  difference(){
    ${cyl('w', 'd/2', 72)};
    translate([0,0,-0.1]) ${cyl('w+0.2', 'hub', 32)};
  }
}
wheel_80();
`,
  'wheels/omni_100mm.scad': `module omni_hub(d=100,w=18){
  difference(){
    ${cyl('w', 'd/2', 80)};
    translate([0,0,-0.1]) ${cyl('w+0.2', 6, 32)};
  }
}
omni_hub();
`,
  'wheels/mecanum_80mm.scad': `module mecanum_hub(d=80,w=30){
  difference(){
    ${cyl('w', 'd/2', 64)};
    translate([0,0,-0.1]) ${cyl('w+0.2', 5, 28)};
  }
}
mecanum_hub();
`,
  'gearbox/planetary_37gb.scad': `module planetary_shell(od=37,h=28){
  difference(){
    ${cyl('h', 'od/2', 48)};
    translate([0,0,2]) ${cyl('h', 'od/2-2.5', 48)};
  }
}
planetary_shell();
`,
  'gearbox/spur_775.scad': `module spur_775_mount(){
  difference(){
    cube([50,42,4]);
    translate([25,21,-0.1]) ${cyl(4.2, 21, 48)};
  }
}
spur_775_mount();
`,
  'gearbox/worm_gearbox.scad': `module worm_box(){
  difference(){
    cube([60,40,35]);
    translate([2,2,2]) cube([56,36,33]);
  }
}
worm_box();
`,
  'mounts/tof_mount.scad': `module tof_mount(){
  difference(){
    cube([30,18,3]);
    translate([4,9,-0.1]) ${cyl(3.2, 1.2, 20)};
    translate([26,9,-0.1]) ${cyl(3.2, 1.2, 20)};
  }
}
tof_mount();
`,
  'mounts/lidar_mount.scad': `module lidar_mount(){
  difference(){
    ${cyl(4, 35, 64)};
    translate([0,0,-0.1]) ${cyl(4.2, 28, 64)};
  }
}
lidar_mount();
`,
  'mounts/camera_mount.scad': `module camera_mount(){
  difference(){
    cube([40,30,3]);
    translate([20,15,-0.1]) ${cyl(3.2, 5, 32)};
  }
}
camera_mount();
`,
  'mounts/pcb_holder.scad': `module pcb_holder(w=70,d=50,t=2){
  difference(){
    cube([w+6,d+6,t+4]);
    translate([3,3,t]) cube([w,d,5]);
  }
}
pcb_holder();
`,
  'profiles/2020.scad': `module profile_2020(len=40){
  difference(){
    cube([20,20,len]);
    translate([5,5,-0.1]) cube([10,10,len+0.2]);
  }
}
profile_2020();
`,
  'profiles/2040.scad': `module profile_2040(len=40){
  difference(){
    cube([20,40,len]);
    translate([5,5,-0.1]) cube([10,10,len+0.2]);
    translate([5,25,-0.1]) cube([10,10,len+0.2]);
  }
}
profile_2040();
`,
  'profiles/connectors/corner.scad': `module corner_2020(){ cube([20,20,20]); }
corner_2020();
`,
  'profiles/connectors/t_connector.scad': `module t_conn(){
  union(){ cube([60,20,20]); translate([20,-20,0]) cube([20,20,20]); }
}
t_conn();
`,
  'batteries/18650_holder.scad': `module h18650(){
  difference(){ cube([22,70,20]); translate([2,2,2]) cube([18,66,20]); }
}
h18650();
`,
  'batteries/lipo_3s_holder.scad': `module lipo3s(){
  difference(){ cube([75,40,25]); translate([2,2,2]) cube([71,36,25]); }
}
lipo3s();
`,
  'batteries/9v_holder.scad': `module h9v(){
  difference(){ cube([30,20,20]); translate([2,2,2]) cube([26,16,20]); }
}
h9v();
`,
  'motors/n20_mount.scad': `module n20_mount(){
  difference(){
    cube([24,18,3]);
    translate([6,9,-0.1]) ${cyl(3.2, 1.1, 16)};
    translate([18,9,-0.1]) ${cyl(3.2, 1.1, 16)};
  }
}
n20_mount();
`,
  'motors/37gb_mount.scad': `module m37(){
  difference(){ cube([42,42,4]); translate([21,21,-0.1]) ${cyl(4.2, 12, 40)}; }
}
m37();
`,
  'motors/775_mount.scad': `module m775(){
  difference(){ cube([50,50,4]); translate([25,25,-0.1]) ${cyl(4.2, 18, 48)}; }
}
m775();
`,
  'hubs/wheel_hub_universal.scad': `module hub(){
  difference(){ ${cyl(12, 12, 48)}; translate([0,0,-0.1]) ${cyl(12.2, 2.5, 24)}; }
}
hub();
`,
  'hubs/axle_adapter.scad': `module axle(){
  difference(){ ${cyl(20, 6, 32)}; translate([0,0,-0.1]) ${cyl(20.2, 2.5, 20)}; }
}
axle();
`,
};

const catalog = {};
const keyMap = {
  'brackets/mg996r.scad': 'mg996r_servo_bracket',
  'brackets/sg90.scad': 'sg90_servo_bracket',
  'brackets/ds3218.scad': 'ds3218_servo_bracket',
  'wheels/wheel_65mm.scad': 'wheel_65mm',
  'wheels/wheel_80mm.scad': 'wheel_80mm',
  'wheels/omni_100mm.scad': 'omni_100mm',
  'wheels/mecanum_80mm.scad': 'mecanum_80mm',
  'gearbox/planetary_37gb.scad': 'planetary_37gb',
  'gearbox/spur_775.scad': 'spur_775',
  'gearbox/worm_gearbox.scad': 'worm_gearbox',
  'mounts/tof_mount.scad': 'tof_mount',
  'mounts/lidar_mount.scad': 'lidar_mount',
  'mounts/camera_mount.scad': 'camera_mount',
  'mounts/pcb_holder.scad': 'pcb_holder_universal',
  'profiles/2020.scad': 'profile_2020',
  'profiles/2040.scad': 'profile_2040',
  'profiles/connectors/corner.scad': 'corner_connector',
  'profiles/connectors/t_connector.scad': 't_connector',
  'batteries/18650_holder.scad': 'holder_18650',
  'batteries/lipo_3s_holder.scad': 'lipo_3s_holder',
  'batteries/9v_holder.scad': 'holder_9v',
  'motors/n20_mount.scad': 'n20_mount',
  'motors/37gb_mount.scad': '37gb_mount',
  'motors/775_mount.scad': '775_mount',
  'hubs/wheel_hub_universal.scad': 'wheel_hub_universal',
  'hubs/axle_adapter.scad': 'axle_adapter',
};

for (const [rel, body] of Object.entries(files)) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  const key = keyMap[rel];
  if (key) {
    catalog[key] = {
      path: rel.replace(/\\/g, '/'),
      format: 'scad',
      tags: key.split('_'),
      label: key.replace(/_/g, ' '),
    };
  }
}

fs.writeFileSync(
  path.join(root, 'metadata/components.json'),
  JSON.stringify(catalog, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(root, 'README.md'),
  `# Cavallo Robotics Standard Library

Extended printable robotics parts (OpenSCAD). Served via jsDelivr from the Cavallo Studio repo.

CDN base example:
\`https://cdn.jsdelivr.net/gh/boctavian2014-ux/C-A-V-A-L-Studio@main/libraries/robotics-standard/\`

Override with env \`ROBOTICS_LIBRARY_CDN_BASE\`.
`
);

console.log('wrote', Object.keys(files).length, 'scad + catalog');
