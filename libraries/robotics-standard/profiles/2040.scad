module profile_2040(len=40){
  difference(){
    cube([20,40,len]);
    translate([5,5,-0.1]) cube([10,10,len+0.2]);
    translate([5,25,-0.1]) cube([10,10,len+0.2]);
  }
}
profile_2040();
