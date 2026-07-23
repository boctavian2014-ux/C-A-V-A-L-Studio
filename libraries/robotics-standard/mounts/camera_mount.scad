module camera_mount(){
  difference(){
    cube([40,30,3]);
    translate([20,15,-0.1]) cylinder(h=3.2,r=5,$fn=32);
  }
}
camera_mount();
