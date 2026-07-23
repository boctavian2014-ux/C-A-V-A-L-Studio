module lidar_mount(){
  difference(){
    cylinder(h=4,r=35,$fn=64);
    translate([0,0,-0.1]) cylinder(h=4.2,r=28,$fn=64);
  }
}
lidar_mount();
